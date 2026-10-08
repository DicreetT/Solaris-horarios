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

const renderCleanup = () => {
    root.render(
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
            <div className="max-w-xl">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                <h1 className="text-xl font-black mb-2">Limpiando Lunaris en este navegador</h1>
                <p className="text-sm opacity-80">
                    Estamos borrando una copia local antigua. En unos segundos volverás a iniciar sesión.
                </p>
            </div>
        </div>,
    )
}

async function clearLocalBrowserState() {
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
    }

    if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
    }

    if ('indexedDB' in window && typeof indexedDB.databases === 'function') {
        const databases = await indexedDB.databases()
        await Promise.all(
            databases
                .map((database) => database.name)
                .filter((name): name is string => !!name)
                .map((name) => new Promise<void>((resolve) => {
                    const request = indexedDB.deleteDatabase(name)
                    request.onsuccess = () => resolve()
                    request.onerror = () => resolve()
                    request.onblocked = () => resolve()
                })),
        )
    }

    window.localStorage.clear()
    window.sessionStorage.clear()
}

function isCleanupRequested() {
    const params = new URLSearchParams(window.location.search)
    return params.get('limpieza') === '1' || params.get('reset-lunaris') === '1'
}

async function runCleanupAndRestart() {
    renderCleanup()
    try {
        await clearLocalBrowserState()
    } catch (error) {
        console.warn('No se pudo limpiar todo el estado local de Lunaris.', error)
    } finally {
        const nextUrl = new URL('/login', window.location.origin)
        nextUrl.searchParams.set('limpieza', 'hecha')
        nextUrl.searchParams.set('t', String(Date.now()))
        window.location.replace(nextUrl.toString())
    }
}

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

if (isCleanupRequested()) {
    void runCleanupAndRestart()
} else {
    window.addEventListener('error', (event) => {
        renderFatal('Lunaris encontró un error al iniciar', `${event.message || 'Error desconocido'}`)
    })

    window.addEventListener('unhandledrejection', (event) => {
        const reason = (event.reason && (event.reason.message || String(event.reason))) || 'Error desconocido'
        const normalized = String(reason).toLowerCase()
        const isTransientNetwork =
            normalized.includes('failed to fetch') ||
            normalized.includes('networkerror') ||
            normalized.includes('network error') ||
            normalized.includes('load failed') ||
            normalized.includes('timeout') ||
            normalized.includes('tiempo de espera')

        if (isTransientNetwork) {
            console.warn('Transient unhandled rejection ignored:', reason)
            event.preventDefault()
            return
        }

        renderFatal('Lunaris encontró un error al iniciar', reason)
    })

    bootstrap()
}
