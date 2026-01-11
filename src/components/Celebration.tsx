import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Particle {
    id: string;
    x: number;
    y: number;
    color: string;
    size: number;
}

interface CelebrationProps {
    isVisible: boolean;
    onComplete: () => void;
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

export const Celebration: React.FC<CelebrationProps> = ({ isVisible, onComplete }) => {
    const [particles, setParticles] = React.useState<Particle[]>([]);

    React.useEffect(() => {
        if (isVisible) {
            const newParticles = Array.from({ length: 15 }).map((_, i) => ({
                id: Math.random().toString(36).substr(2, 9),
                x: (Math.random() - 0.5) * 100,
                y: (Math.random() - 0.5) * 100,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                size: Math.random() * 8 + 4
            }));
            setParticles(newParticles);

            const timer = setTimeout(() => {
                setParticles([]);
                onComplete();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onComplete]);

    return (
        <AnimatePresence>
            {isVisible && (
                <div className="absolute inset-0 pointer-events-none z-50 overflow-visible flex items-center justify-center">
                    {particles.map((p) => (
                        <motion.div
                            key={p.id}
                            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                            animate={{
                                x: p.x,
                                y: p.y,
                                scale: 1,
                                opacity: 0,
                                rotate: 360
                            }}
                            transition={{
                                duration: 0.8,
                                ease: "easeOut"
                            }}
                            style={{
                                width: p.size,
                                height: p.size,
                                borderRadius: '50%',
                                backgroundColor: p.color,
                                position: 'absolute'
                            }}
                        />
                    ))}
                </div>
            )}
        </AnimatePresence>
    );
};
