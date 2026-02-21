import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Info } from 'lucide-react';
import { Todo } from '../types';

interface StormOverlayProps {
    isActive: boolean;
    shockedTasks: Todo[];
    onTaskClick?: (taskId: number) => void;
    children: React.ReactNode;
}

export const StormOverlay: React.FC<StormOverlayProps> = ({ isActive, shockedTasks, onTaskClick, children }) => {
    const [panelDismissed, setPanelDismissed] = React.useState(false);

    React.useEffect(() => {
        if (!isActive) {
            setPanelDismissed(false);
        }
    }, [isActive]);

    // Raindrops generation - more dense and visible
    const raindrops = React.useMemo(() => {
        return Array.from({ length: 80 }).map((_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            delay: Math.random() * 2,
            duration: 0.4 + Math.random() * 0.4,
            opacity: 0.2 + Math.random() * 0.4,
            height: 20 + Math.random() * 30,
        }));
    }, []);

    // Flash state for lightning
    const [isFlashing, setIsFlashing] = React.useState(false);

    React.useEffect(() => {
        if (!isActive) return;

        const triggerFlash = () => {
            setIsFlashing(true);
            setTimeout(() => setIsFlashing(false), 100);

            // Double flash
            if (Math.random() > 0.4) {
                setTimeout(() => {
                    setIsFlashing(true);
                    setTimeout(() => setIsFlashing(false), 80);
                }, 150);
            }

            // Schedule next lightning strike - much more frequent!
            const nextFlash = 4000 + Math.random() * 8000;
            const timer = setTimeout(triggerFlash, nextFlash);
            return () => clearTimeout(timer);
        };

        const timer = setTimeout(triggerFlash, 3000);
        return () => clearTimeout(timer);
    }, [isActive]);

    return (
        <div className="relative min-h-screen overflow-hidden bg-slate-950">
            {/* Main Content with Filter */}
            <motion.div
                animate={{
                    scale: 1,
                }}
                transition={{ duration: 2, ease: "easeInOut" }}
                className="relative min-h-screen bg-white dark:bg-slate-900"
            >
                {children}
            </motion.div>

            {/* Storm Effects Overlay */}
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5 }}
                        className="fixed inset-0 pointer-events-none z-[100] overflow-hidden"
                    >
                        {/* Gloomy Vignette */}
                        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/65 via-slate-900/20 to-slate-950/80 shadow-[inset_0_0_220px_rgba(0,0,0,0.85)]" />

                        {/* Animated Clouds (SVG) - Top */}
                        <div className="absolute top-0 left-0 right-0 overflow-hidden h-56">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <motion.div
                                    key={i}
                                    initial={{ x: '-100%' }}
                                    animate={{ x: '120%' }}
                                    transition={{
                                        duration: 15 + i * 5,
                                        repeat: Infinity,
                                        ease: "linear",
                                        delay: i * -10
                                    }}
                                    className="absolute opacity-45 blur-[2px]"
                                    style={{ top: `${i * 8}%` }}
                                >
                                    <div className="relative w-72 h-28 rounded-[999px] bg-slate-700/80 border border-slate-500/20">
                                        <div className="absolute -top-4 left-10 w-24 h-16 rounded-[999px] bg-slate-700/80" />
                                        <div className="absolute -top-6 left-28 w-28 h-18 rounded-[999px] bg-slate-700/80" />
                                        <div className="absolute -top-3 left-48 w-20 h-14 rounded-[999px] bg-slate-700/80" />
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Raindrops */}
                        {raindrops.map((drop) => (
                            <motion.div
                                key={drop.id}
                                initial={{ y: -50 }}
                                animate={{ y: '110vh' }}
                                transition={{
                                    duration: drop.duration,
                                    repeat: Infinity,
                                    ease: "linear",
                                    delay: drop.delay,
                                }}
                                style={{
                                    position: 'absolute',
                                    left: drop.left,
                                    width: '2px',
                                    height: `${drop.height}px`,
                                    background: 'linear-gradient(to bottom, transparent, rgba(148, 163, 184, 0.6))',
                                    opacity: drop.opacity,
                                    transform: 'rotate(5deg)',
                                }}
                            />
                        ))}

                        {/* Lightning Flash Overlay */}
                        <motion.div
                            animate={{
                                opacity: isFlashing ? [0, 0.6, 0.2, 0.4, 0] : 0,
                                background: isFlashing ? '#fff' : 'transparent',
                            }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 z-50 mix-blend-overlay"
                        />

                        {/* Storm Information Toast */}
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-sm px-6 pointer-events-auto">
                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: panelDismissed ? 16 : 0, opacity: panelDismissed ? 0 : 1 }}
                                transition={{ delay: 1, type: "spring" }}
                                className={`bg-slate-900/90 backdrop-blur-xl border border-slate-700 p-5 rounded-3xl shadow-2xl space-y-4 ${panelDismissed ? 'pointer-events-none' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-yellow-500/20 rounded-xl">
                                        <Zap className="text-yellow-500 animate-pulse" size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-white font-black text-lg">Estado: Tormenta</h4>
                                        <p className="text-slate-400 text-xs">Te han dado una electrocutada ⚡</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-slate-300 text-sm font-medium">Completa esto para volver al sol:</p>
                                    <ul className="space-y-1.5 pointer-events-auto">
                                        {shockedTasks.map(t => (
                                            <motion.li
                                                key={t.id}
                                                whileHover={{ scale: 1.02, x: 5 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => {
                                                    setPanelDismissed(true);
                                                    onTaskClick?.(t.id);
                                                }}
                                                className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 p-2 rounded-lg border border-slate-700/50 cursor-pointer shadow-sm hover:text-white transition-colors group"
                                            >
                                                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping group-hover:bg-yellow-400" />
                                                <span className="truncate flex-1 font-bold">{t.title}</span>
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Info size={12} className="text-slate-400" />
                                                </div>
                                            </motion.li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                                    <span className="text-[10px] text-slate-500 flex items-center gap-1 uppercase tracking-widest font-bold">
                                        <Info size={10} /> Lunaris System
                                    </span>
                                    {shockedTasks.length === 0 && (
                                        <span className="text-green-400 text-[10px] font-black animate-bounce">
                                            ¡Luz detectada! ✨
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
