import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coffee, Heart, Sparkles } from 'lucide-react';

interface CaffeineOverlayProps {
    onComplete: () => void;
    senderName: string;
}

export const CaffeineOverlay: React.FC<CaffeineOverlayProps> = ({ onComplete, senderName }) => {
    useEffect(() => {
        const timer = setTimeout(onComplete, 6000); // 6 seconds duration
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden"
        >
            {/* Warm Amber Glow */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.4, 0.2, 0.4, 0] }}
                transition={{ duration: 6, times: [0, 0.2, 0.5, 0.8, 1] }}
                className="absolute inset-0 bg-orange-400/20 mix-blend-color-dodge"
            />

            {/* Floating Particles */}
            {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{
                        opacity: 0,
                        y: '110vh',
                        x: `${Math.random() * 100}vw`,
                        scale: 0.5
                    }}
                    animate={{
                        opacity: [0, 1, 0],
                        y: '-10vh',
                        x: `${Math.random() * 100 + (Math.random() * 20 - 10)}vw`,
                        rotate: 360,
                        scale: [0.5, 1.2, 0.8]
                    }}
                    transition={{
                        duration: 3 + Math.random() * 3,
                        delay: Math.random() * 2,
                        ease: "easeOut"
                    }}
                    className="absolute text-orange-400"
                >
                    {i % 3 === 0 ? <Coffee size={24} fill="currentColor" /> :
                        i % 3 === 1 ? <Heart size={20} fill="currentColor" /> :
                            <Sparkles size={18} fill="currentColor" />}
                </motion.div>
            ))}

            {/* Central Toast */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <motion.div
                    initial={{ scale: 0, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ type: "spring", damping: 15 }}
                    className="bg-white/90 backdrop-blur-xl border-2 border-orange-200 p-8 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(251,146,60,0.3)] flex flex-col items-center gap-6"
                >
                    <div className="relative">
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="bg-orange-100 p-4 rounded-3xl"
                        >
                            <Coffee size={48} className="text-orange-600" />
                        </motion.div>
                        <motion.div
                            animate={{
                                y: [-10, -30, -10],
                                opacity: [0, 1, 0],
                                scale: [0.5, 1, 0.5]
                            }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="absolute -top-4 -right-2 text-orange-400"
                        >
                            <Sparkles size={24} />
                        </motion.div>
                    </div>

                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-black text-orange-900 tracking-tight">¡Cafeína Lunar! ☕✨</h2>
                        <p className="text-orange-700 font-bold whitespace-nowrap">
                            <span className="text-orange-950 px-3 py-1 bg-orange-100 rounded-lg border border-orange-200">{senderName}</span>
                            <br />
                            <span className="mt-2 block">te ha enviado un chute de energía</span>
                        </p>
                    </div>

                    <motion.div
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 3 }}
                        className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center gap-2"
                    >
                        <Sparkles size={12} /> Lunaris Positivity Engine <Sparkles size={12} />
                    </motion.div>
                </motion.div>
            </div>
        </motion.div>
    );
};
