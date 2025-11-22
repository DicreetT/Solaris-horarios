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
        <div className="app-card" style={{ maxWidth: 400, margin: "40px auto" }}>
            <div className="app-header" style={{ justifyContent: "center" }}>
                <div className="logo-title">
                    <div className="fake-logo">S</div>
                    <div>
                        <h1 style={{ fontSize: "1.4rem" }}>Solaris</h1>
                        <p className="subtitle">Control horario y tareas</p>
                    </div>
                </div>
            </div>

            <div className="separator" />

            <form onSubmit={handleSubmit}>
                <p className="login-description">
                    Escribe tu <strong>correo</strong> y <strong>contraseña</strong>.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                        <label className="field-label">Correo</label>
                        <input
                            className="input"
                            type="email"
                            placeholder="nombre@empresa.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="field-label">Contraseña</label>
                        <input
                            className="input"
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
                        style={{
                            color: "#b91c1c",
                            fontSize: "0.8rem",
                            marginTop: 6,
                        }}
                    >
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 12 }}
                    disabled={loading}
                >
                    {loading ? "Entrando..." : "Entrar"}
                </button>
            </form>
        </div>
    );
}
