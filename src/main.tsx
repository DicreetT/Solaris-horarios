import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import './index.css'

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

    // Hard disable stale PWA runtime caches for now: guarantees latest JS/CSS on every load.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
                registration.unregister()
            })
        })
    }
    if ('caches' in window) {
        caches.keys().then((keys) => {
            keys.forEach((key) => caches.delete(key))
        })
    }
}

const rootElement = document.getElementById('root')
if (!rootElement) {
    throw new Error('No se encontró el nodo #root')
}

const root = ReactDOM.createRoot(rootElement)

const renderFatal = (title: string, detail?: string) => {
    root.render(
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
            <div className="max-w-xl">
                <h1 className="text-xl font-black mb-2">{title}</h1>
                <p className="text-sm opacity-80">
                    {detail || 'Recarga la página. Si persiste, contacta soporte técnico.'}
                </p>
            </div>
        </div>,
    )
}

window.addEventListener('error', (event) => {
    renderFatal('Lunaris encontró un error al iniciar', `${event.message || 'Error desconocido'}`)
})

window.addEventListener('unhandledrejection', (event) => {
    const reason = (event.reason && (event.reason.message || String(event.reason))) || 'Error desconocido'
    renderFatal('Lunaris encontró un error al iniciar', reason)
})

async function bootstrap() {
    try {
        const [{ default: App }, { AuthProvider }] = await Promise.all([
            import('./App'),
            import('./context/AuthContext'),
        ])

        root.render(
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
    } catch (error: any) {
        console.error('Bootstrap error:', error)
        renderFatal('No se pudo iniciar Lunaris', error?.message || 'Error desconocido')
    }
}

bootstrap()
