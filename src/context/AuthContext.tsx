import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';
import type { User } from '../types';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { flushSharedJsonStateWrites } from '../hooks/useSharedJsonState';

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

    const mapAuthUser = (authUser: SupabaseUser): User | null => {
        const email = authUser.email?.toLowerCase();
        const localUser = USERS.find((u) => u.email.toLowerCase() === email);
        if (!localUser) return null;
        return {
            ...localUser,
            id: authUser.id,
            email: authUser.email || localUser.email,
        };
    };

    useEffect(() => {
        const loadingFallback = window.setTimeout(() => {
            setLoading(false);
        }, 3000);

        let isMounted = true;

        // Check active session from local auth storage first (faster than getUser network call).
        async function loadAuthUser() {
            try {
                const { data } = await supabase.auth.getSession();
                if (!isMounted) return;
                const nextUser = data?.session?.user ? mapAuthUser(data.session.user) : null;
                setCurrentUser(nextUser);
            } catch (error) {
                console.error('Error loading auth user:', error);
            } finally {
                if (!isMounted) return;
                setLoading(false);
            }
        }

        loadAuthUser();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return;
            const nextUser = session?.user ? mapAuthUser(session.user) : null;
            setCurrentUser(nextUser);
            setLoading(false);
        });

        return () => {
            isMounted = false;
            window.clearTimeout(loadingFallback);
            subscription.unsubscribe();
        };
    }, []);

    const login = (user: User) => {
        setCurrentUser(user);
    };

    const logout = async () => {
        try {
            // Best effort: persistir cambios pendientes de estado compartido antes de cerrar sesión.
            await flushSharedJsonStateWrites(7000);
            // Optimistic local logout for immediate UI/navigation response.
            setCurrentUser(null);
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) {
                console.warn('Local signOut failed, retrying default signOut:', error);
                await supabase.auth.signOut();
            }
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
