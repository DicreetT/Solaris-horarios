import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import App from './App.jsx'
import './index.css'

import { AuthProvider } from './context/AuthContext'

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
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </QueryClientProvider>
    </React.StrictMode>,
)
