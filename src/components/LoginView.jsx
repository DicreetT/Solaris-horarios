import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';
import { Mail, Lock, ArrowRight } from 'lucide-react';

/**
 * Login por email y contraseña usando Supabase Auth.
 */
export default function LoginView({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
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
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-card rounded-[32px] border-2 border-border shadow-[8px_8px_0_#000000] p-8 md:p-10 max-w-[420px] w-full mx-auto relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center text-center mb-2">
                    <div className="w-48 h-48 relative flex items-center justify-center">
                        <img
                            src="/logo.png"
                            alt="Solaris Logo"
                            className="w-full h-full object-contain drop-shadow-sm hover:scale-105 transition-transform duration-300"
                        />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                    <div className="space-y-3">
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors">
                                <Mail size={20} />
                            </div>
                            <input
                                className="w-full bg-[#fafafa] rounded-xl border-2 border-gray-100 focus:border-black pl-12 pr-4 py-3.5 text-sm font-medium outline-none ring-0 transition-all shadow-sm group-hover:shadow-md placeholder:text-gray-400"
                                type="email"
                                placeholder="nombre@empresa.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors">
                                <Lock size={20} />
                            </div>
                            <input
                                className="w-full bg-[#fafafa] rounded-xl border-2 border-gray-100 focus:border-black pl-12 pr-4 py-3.5 text-sm font-medium outline-none ring-0 transition-all shadow-sm group-hover:shadow-md placeholder:text-gray-400"
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
                        className="w-full bg-primary text-white font-bold text-base py-3.5 rounded-xl border-2 border-black shadow-[4px_4px_0_#000000] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#000000] active:translate-y-[4px] active:shadow-none transition-all flex items-center justify-center gap-2 group"
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
