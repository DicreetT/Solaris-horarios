import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { USERS } from '../constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
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
            subscription.unsubscribe();
        };
    }, []);

    const login = (user) => {
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

    const updatePassword = async (newPassword) => {
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;

            // Update local user data
            if (currentUser) {
                const updatedUser = { ...currentUser, password: newPassword };
                setCurrentUser(updatedUser);
            }
        } catch (error) {
            console.error('Error updating password:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ currentUser, loading, login, logout, updatePassword }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
