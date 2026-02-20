import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';
import type { User } from '../types';

interface AuthContextType {
    currentUser: User | null;
    loading: boolean;
    login: (user: User) => void;
    logout: () => Promise<void>;
    updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
    children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadingFallback = window.setTimeout(() => {
            setLoading(false);
        }, 5000);

        // Check active session
        async function loadAuthUser() {
            try {
                const { data } = await supabase.auth.getUser();
                if (data?.user) {
                    const email = data.user.email?.toLowerCase();
                    const localUser = USERS.find((u) => u.email.toLowerCase() === email);
                    if (localUser) {
                        setCurrentUser(localUser);
                    }
                }
            } catch (error) {
                console.error('Error loading auth user:', error);
            } finally {
                setLoading(false);
            }
        }

        loadAuthUser();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const email = session.user.email?.toLowerCase();
                const localUser = USERS.find((u) => u.email.toLowerCase() === email);
                if (localUser) {
                    setCurrentUser(localUser);
                } else {
                    setCurrentUser(null);
                }
            } else {
                setCurrentUser(null);
            }
            setLoading(false);
        });

        return () => {
            window.clearTimeout(loadingFallback);
            subscription.unsubscribe();
        };
    }, []);

    const login = (user: User) => {
        setCurrentUser(user);
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
            setCurrentUser(null);
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const updatePassword = async (newPassword: string): Promise<void> => {
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;
        } catch (error) {
            console.error('Error updating password:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ currentUser, loading, login, logout, updatePassword }}>
            {loading ? (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                    <div className="text-center">
                        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-sm font-semibold opacity-90">Cargando Lunaris...</p>
                    </div>
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
