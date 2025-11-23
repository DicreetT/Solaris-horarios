import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';
import { Mail, Lock, ArrowRight, Snowflake } from 'lucide-react';

/**
 * Snowflake animation component
 * Renders falling snowflakes only in December
 */
interface Snowflake {
    id: number;
    left: number;
    animationDuration: string;
    animationDelay: string;
    opacity: number;
    size: number;
    blur: number;
}

const Snowflakes = () => {
    const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

    useEffect(() => {
        // Only show in November, December, and January (months 10, 11, 0)
        const month = new Date().getMonth();
        const isWinter = month === 10 || month === 11 || month === 0;

        if (!isWinter) return;

        // Generate initial snowflakes
        const initialSnowflakes = Array.from({ length: 75 }).map((_, i) => ({
            id: i,
            left: Math.random() * 100,
            animationDuration: Math.random() * 5 + 10 + 's', // Slower: 10-15s
            animationDelay: -Math.random() * 20 + 's', // Start mid-animation
            opacity: Math.random() * 0.5 + 0.3,
            size: Math.random() * 20 + 10, // Bigger: 10-30px
            blur: Math.random() < 0.3 ? Math.random() * 2 + 1 : 0, // 30% chance of blur for depth
        }));
        setSnowflakes(initialSnowflakes);
    }, []);

    if (snowflakes.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            <style>
                {`
          @keyframes fall {
            0% { transform: translateY(-10vh) translateX(0); }
            25% { transform: translateY(25vh) translateX(15px); }
            50% { transform: translateY(50vh) translateX(-15px); }
            75% { transform: translateY(75vh) translateX(15px); }
            100% { transform: translateY(100vh) translateX(0); }
          }
        `}
            </style>
            {snowflakes.map((flake) => (
                <div
                    key={flake.id}
                    className="absolute text-white drop-shadow-md"
                    style={{
                        left: `${flake.left}%`,
                        top: -20,
                        fontSize: `${flake.size}px`,
                        opacity: flake.opacity,
                        filter: `blur(${flake.blur}px)`,
                        animation: `fall ${flake.animationDuration} linear infinite`,
                        animationDelay: flake.animationDelay,
                    }}
                >
                    ❄
                </div>
            ))}
        </div>
    );
};

/**
 * Login por email y contraseña usando Supabase Auth.
 */
import { User } from '../types';

export default function LoginView({ onLogin }: { onLogin: (user: User) => void }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        setLoading(false);

        if (error || !data?.user) {
            console.error(error);
            setError("Correo o contraseña incorrectos");
            return;
        }

        const loggedEmail = (data.user.email || "").toLowerCase();

        // Buscamos la config de rol en nuestro array USERS
        const configuredUser =
            USERS.find((u) => u.email.toLowerCase() === loggedEmail) || null;

        const finalUser =
            configuredUser ||
            {
                id: data.user.id,
                name: data.user.email,
                role: "Usuario",
                email: data.user.email,
                canAdminHours: false,
                isTrainingManager: false,
            };

        onLogin(finalUser);
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative bg-gradient-to-b from-slate-900 to-slate-800">
            {/* Seasonal Background Animation */}
            <Snowflakes />

            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl p-8 md:p-12 max-w-[420px] w-full mx-auto relative overflow-hidden z-10">
                {/* Decorative background element */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center text-center mb-8 w-full">
                    <div className="w-full px-12 relative flex items-center justify-center">
                        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-50" />
                        <img
                            src="/logo.png"
                            alt="Solaris Logo"
                            className="w-full h-auto object-contain relative z-10 drop-shadow-sm hover:scale-105 transition-transform duration-300"
                        />
                    </div>
                    {/* Removed text as requested in previous steps, keeping it clean */}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                    <div className="space-y-4">
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors">
                                <Mail size={20} />
                            </div>
                            <input
                                className="w-full bg-gray-50 rounded-xl border border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 pl-12 pr-4 py-3.5 text-sm font-medium outline-none transition-all placeholder:text-gray-400"
                                type="email"
                                placeholder="nombre@empresa.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors">
                                <Lock size={20} />
                            </div>
                            <input
                                className="w-full bg-gray-50 rounded-xl border border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 pl-12 pr-4 py-3.5 text-sm font-medium outline-none transition-all placeholder:text-gray-400"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-xs font-bold px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-primary text-white font-bold text-base py-3.5 rounded-xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Entrando...
                            </span>
                        ) : (
                            <>
                                Iniciar Sesión
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-xs text-gray-400 font-medium">
                        © {new Date().getFullYear()} Solaris. Todos los derechos reservados.
                    </p>
                </div>
            </div>
        </div>
    );
}
