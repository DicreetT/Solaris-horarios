import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import App from './App'
import './index.css'

import { AuthProvider } from './context/AuthContext'

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error: unknown) {
        console.error('Root render error:', error)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
                    <div>
                        <h1 className="text-xl font-black mb-2">Error al cargar Lunaris</h1>
                        <p className="text-sm opacity-80">Recarga la página. Si persiste, contacta soporte técnico.</p>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}

// Prevent "white screen after refresh" caused by stale PWA chunks.
// Emergency cache recovery: unregister stale Service Workers and clear old caches once.
if (typeof window !== 'undefined') {
    window.addEventListener('vite:preloadError', () => {
        window.location.reload()
    })

    const SW_RESET_KEY = 'lunaris-sw-reset-v2'
    const hasReset = (() => {
        try {
            return window.localStorage.getItem(SW_RESET_KEY) === '1'
        } catch {
            return false
        }
    })()

    if (!hasReset && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
                registration.unregister()
            })
        })
        if ('caches' in window) {
            caches.keys().then((keys) => {
                keys.forEach((key) => caches.delete(key))
            })
        }
        try {
            window.localStorage.setItem(SW_RESET_KEY, '1')
        } catch {
            // noop
        }
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <RootErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </QueryClientProvider>
        </RootErrorBoundary>
    </React.StrictMode>,
)
