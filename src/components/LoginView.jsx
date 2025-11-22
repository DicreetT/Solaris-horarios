import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';

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
        <div className="bg-bg rounded-[20px] border-2 border-border shadow-[6px_6px_0_rgba(0,0,0,0.2)] p-4 md:p-6 md:px-7 max-w-[400px] mx-auto my-10">
            <div className="flex items-center justify-center gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center font-extrabold bg-[radial-gradient(circle_at_top,#fff2cc,#ffb347)]">S</div>
                    <div>
                        <h1 className="text-[1.4rem]">Solaris</h1>
                        <p className="text-sm text-[#555]">Control horario y tareas</p>
                    </div>
                </div>
            </div>

            <div className="h-px bg-[#ddd] my-3" />

            <form onSubmit={handleSubmit}>
                <p className="text-[0.85rem] text-[#555] mb-2.5">
                    Escribe tu <strong>correo</strong> y <strong>contraseña</strong>.
                </p>
                <div className="flex flex-col gap-2">
                    <div>
                        <label className="text-xs font-semibold mt-1">Correo</label>
                        <input
                            className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-sm font-inherit"
                            type="email"
                            placeholder="nombre@empresa.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold mt-1">Contraseña</label>
                        <input
                            className="w-full rounded-[10px] border border-[#ccc] p-1.5 text-sm font-inherit"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                </div>

                {error && (
                    <p
                        className="text-[#b91c1c] text-xs mt-1.5"
                    >
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    className="rounded-full border-2 border-border px-3.5 py-2 text-sm font-semibold cursor-pointer bg-white inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark w-full justify-center mt-3"
                    disabled={loading}
                >
                    {loading ? "Entrando..." : "Entrar"}
                </button>
            </form>
        </div>
    );
}
