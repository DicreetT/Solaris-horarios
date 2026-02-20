import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import App from './App.jsx'
import './index.css'

import { AuthProvider } from './context/AuthContext'

// Prevent "white screen after refresh" caused by stale PWA chunks.
// In localhost we unregister old Service Workers to avoid cache conflicts during rapid development.
if (typeof window !== 'undefined') {
    window.addEventListener('vite:preloadError', () => {
        window.location.reload()
    })

    const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'

    if (isLocalhost && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
                registration.unregister()
            })
        })
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
