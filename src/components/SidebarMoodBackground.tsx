import React from 'react';
import { motion } from 'framer-motion';

interface SidebarMoodBackgroundProps {
    emoji: string | undefined;
}

export const SidebarMoodBackground: React.FC<SidebarMoodBackgroundProps> = ({ emoji }) => {
    if (!emoji) return null;

    return (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0 rounded-3xl">
            {/* 1. Nivel: Protagonista (✨) */}
            {emoji === '✨' && (
                <div className="absolute inset-0 bg-gradient-to-br from-amber-100/80 via-purple-100/60 to-amber-100/80">
                    {[...Array(8)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{
                                top: `${Math.random() * 100}%`,
                                left: `${Math.random() * 100}%`,
                                scale: 0,
                                opacity: 0
                            }}
                            animate={{
                                scale: [0, 1.2, 0],
                                opacity: [0, 1, 0],
                                rotate: [0, 45, 90]
                            }}
                            transition={{
                                duration: 2 + Math.random() * 2,
                                repeat: Infinity,
                                delay: Math.random() * 2,
                                ease: "easeInOut"
                            }}
                            className="absolute text-yellow-500/80 text-2xl"
                        >
                            ✨
                        </motion.div>
                    ))}
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]" />
                </div>
            )}

            {/* 2. Hoy nada me afecta (🌸) */}
            {emoji === '🌸' && (
                <div className="absolute inset-0 bg-gradient-to-b from-pink-100 via-white/80 to-purple-100/80">
                    <motion.div
                        animate={{
                            y: [0, -30, 0],
                            rotate: [0, 5, -5, 0]
                        }}
                        transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="absolute bottom-0 w-full h-[120%] opacity-50"
                    >
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full fill-pink-300/40">
                            <path d="M0,50 Q25,60 50,50 T100,50 V100 H0 Z" />
                        </svg>
                    </motion.div>
                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ y: 100, x: Math.random() * 100, opacity: 0 }}
                            animate={{
                                y: -50,
                                x: `calc(${Math.random() * 100}% + ${Math.random() * 50 - 25}px)`,
                                opacity: [0, 0.8, 0],
                                rotate: [0, 360]
                            }}
                            transition={{
                                duration: 8 + Math.random() * 4,
                                repeat: Infinity,
                                delay: Math.random() * 5
                            }}
                            className="absolute bottom-0 text-pink-400 text-lg"
                        >
                            🌸
                        </motion.div>
                    ))}
                </div>
            )}

            {/* 3. Paciencia nivel experto (☁️) */}
            {emoji === '☁️' && (
                <div className="absolute inset-0 bg-gradient-to-b from-gray-200 to-blue-100/80">
                    {/* Cloud moving LEFT */}
                    <motion.div
                        animate={{ x: ['120%', '-120%'] }}
                        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                        className="absolute top-[10%] opacity-40"
                    >
                        <div className="text-7xl text-gray-500 blur-sm">☁️</div>
                    </motion.div>

                    {/* Cloud moving RIGHT */}
                    <motion.div
                        animate={{ x: ['-60%', '160%'] }}
                        transition={{ duration: 10, repeat: Infinity, ease: "linear", delay: 1 }}
                        className="absolute top-[30%] opacity-40"
                    >
                        <div className="text-6xl text-gray-600 scale-x-[-1] blur-sm">☁️</div>
                    </motion.div>

                    {/* Tremor effect */}
                    <motion.div
                        animate={{ x: [0, 2, -2, 0, 2, 0] }}
                        transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 2 }}
                        className="absolute inset-0 bg-gray-600/10 mix-blend-overlay"
                    />
                </div>
            )}

            {/* 4. Sin Paciencia (🔥) */}
            {emoji === '🔥' && (
                <div className="absolute inset-0 bg-gradient-to-t from-orange-200 via-red-100 to-yellow-50 overflow-hidden">
                    <div className="absolute inset-0 bg-orange-500/10 mix-blend-overlay" />

                    {/* Large Fire Base */}
                    <div className="absolute bottom-[-10%] left-[-20%] right-[-20%] h-[60%] flex justify-center items-end filter blur-xl opacity-80">
                        {/* Main Flame Core */}
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                y: [0, -20, 0],
                            }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            className="w-[80%] h-[80%] bg-gradient-to-t from-red-600 via-orange-500 to-yellow-400 rounded-t-full opacity-90"
                        />
                        {/* Inner Flame */}
                        <motion.div
                            animate={{
                                scale: [1, 1.2, 1],
                                y: [0, -30, 0],
                            }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                            className="absolute bottom-0 w-[60%] h-[70%] bg-gradient-to-t from-yellow-500 via-yellow-300 to-white rounded-t-full opacity-80 mix-blend-screen"
                        />
                    </div>

                    {/* Rising Heat/Glow */}
                    <motion.div
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 bg-gradient-to-t from-red-500/30 via-transparent to-transparent"
                    />

                    {/* Occasional Large Spark */}
                    {[...Array(3)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ bottom: '20%', left: '50%', opacity: 0, scale: 0 }}
                            animate={{
                                bottom: '80%',
                                left: [`${40 + Math.random() * 20}%`, `${30 + Math.random() * 40}%`],
                                opacity: [0, 1, 0],
                                scale: [0.5, 2, 0]
                            }}
                            transition={{
                                duration: 3 + Math.random(),
                                repeat: Infinity,
                                delay: Math.random() * 3,
                                ease: "easeOut"
                            }}
                            className="absolute w-8 h-8 rounded-full bg-orange-400 blur-md opacity-60 mix-blend-screen"
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
