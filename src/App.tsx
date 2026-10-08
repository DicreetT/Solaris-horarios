import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// Components
import LoginView from './components/LoginView';
import Layout from './components/Layout';
import { NotificationsProvider } from './context/NotificationsContext';
import { CARLOS_EMAIL } from './constants';

// Pages
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const RoleHomePrototypePage = React.lazy(() => import('./pages/RoleHomePrototypePage'));
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'));
const AnnouncementsPage = React.lazy(() => import('./pages/AnnouncementsPage'));
const MentionsPage = React.lazy(() => import('./pages/MentionsPage'));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage'));
const SalesLearningPage = React.lazy(() => import('./pages/SalesLearningPage'));
const InventoryDailyEventsPage = React.lazy(() => import('./pages/InventoryDailyEventsPage'));
const FinanceOperationsPage = React.lazy(() => import('./pages/FinanceOperationsPage'));
const OperationsSupportPage = React.lazy(() => import('./pages/OperationsSupportPage'));
const TasksModernPreviewPage = React.lazy(() => import('./pages/TasksModernPreviewPage'));
const MeetingsPage = React.lazy(() => import('./pages/MeetingsPage'));
const AbsencesPage = React.lazy(() => import('./pages/AbsencesPage'));
const TrainingsPage = React.lazy(() => import('./pages/TrainingsPage'));
const ExportsPage = React.lazy(() => import('./pages/ExportsPage'));
const TimeTrackingPage = React.lazy(() => import('./pages/TimeTrackingPage'));
const FoldersPage = React.lazy(() => import('./pages/FoldersPage'));
const AlbaranesPage = React.lazy(() => import('./pages/AlbaranesPage'));
const ShoppingListPage = React.lazy(() => import('./pages/ShoppingListPage'));
const DailyChecklistPage = React.lazy(() => import('./pages/DailyChecklistPage'));
const InventoryUnifiedPage = React.lazy(() => import('./pages/InventoryUnifiedPage'));
const FacturacionPage = React.lazy(() => import('./pages/FacturacionPage'));
const BillingPaymentsPage = React.lazy(() => import('./pages/BillingPaymentsPage'));
const OperationalControlPage = React.lazy(() => import('./pages/OperationalControlPage'));
const TraceabilityDossierPage = React.lazy(() => import('./pages/TraceabilityDossierPage'));

/**
 * Protected Route wrapper
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

import { User } from './types';

type RouteErrorBoundaryState = {
  error: Error | null;
};

async function clearStaleBrowserState() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('No se pudo limpiar la cache de Lunaris.', error);
  }
}

function isStaleChunkError(error: unknown) {
  const text = String((error as any)?.message || error || '').toLowerCase();
  return (
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('importing a module script failed') ||
    text.includes('mime type') ||
    text.includes('expected a javascript module') ||
    text.includes('loading chunk') ||
    text.includes('dynamically imported module')
  );
}

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isStaleChunkError(error)) return;
    const recoveryKey = 'lunaris-stale-chunk-recovery';
    const alreadyTried = window.sessionStorage.getItem(recoveryKey);
    if (alreadyTried) return;
    window.sessionStorage.setItem(recoveryKey, '1');
    void clearStaleBrowserState().finally(() => {
      window.location.replace(`${window.location.pathname}${window.location.search || ''}`);
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[40vh] flex items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-xl font-black text-slate-950">Lunaris necesita recargar este módulo</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Parece una versión anterior guardada en el navegador. No se han borrado datos; solo hay que limpiar la caché visual y recargar.
          </p>
          <button
            type="button"
            onClick={() => {
              void clearStaleBrowserState().finally(() => window.location.reload());
            }}
            className="mt-5 rounded-2xl bg-teal-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-teal-800"
          >
            Recargar Lunaris
          </button>
        </div>
      </div>
    );
  }
}

function RouteLoadingFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center px-4">
      <div className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-semibold text-violet-700 shadow-sm">
        Cargando módulo...
      </div>
    </div>
  );
}

function withLazyPage(page: React.ReactElement) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>{page}</Suspense>
    </RouteErrorBoundary>
  );
}

/**
 * App principal with routing
 */
function App() {
  const { currentUser, login } = useAuth();
  const isRestrictedUser =
    (currentUser?.email || '').toLowerCase() === CARLOS_EMAIL || !!currentUser?.isRestricted;

  const handleLogin = (user: User) => {
    login(user);
  };

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Login route */}
          <Route
            path="/login"
            element={
              currentUser ? (
                <Navigate to="/inicio-roles" replace />
              ) : (
                <LoginView onLogin={handleLogin} />
              )
            }
          />

          {/* Redirect root to calendar or login */}
          <Route
            path="/"
            element={
              <Navigate to={currentUser ? "/inicio-roles" : "/login"} replace />
            }
          />

          {/* All authenticated routes use the Layout and ProtectedRoute */}
          <Route element={
            <ProtectedRoute>
              <NotificationsProvider currentUser={currentUser}>
                <Layout />
              </NotificationsProvider>
            </ProtectedRoute>
          }>
            <Route path="/dashboard" element={withLazyPage(<Dashboard />)} />
            <Route path="/inicio-roles" element={withLazyPage(<RoleHomePrototypePage />)} />
            <Route path="/avisos" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<AnnouncementsPage />)} />
            <Route path="/mentions" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<MentionsPage />)} />
            <Route path="/projects" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<ProjectsPage />)} />
            <Route path="/formacion-ventas" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<SalesLearningPage />)} />
            <Route path="/eventos-inventario" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<InventoryDailyEventsPage />)} />
            <Route path="/finanzas-operativas" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<FinanceOperationsPage />)} />
            <Route path="/operaciones-fer" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<OperationsSupportPage />)} />
            <Route path="/calendar" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<CalendarPage />)} />
            <Route path="/tasks" element={withLazyPage(<TasksModernPreviewPage />)} />
            <Route path="/meetings" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<MeetingsPage />)} />
            <Route path="/absences" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<AbsencesPage />)} />
            <Route path="/trainings" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<TrainingsPage />)} />
            <Route path="/time-tracking" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<TimeTrackingPage />)} />
            <Route path="/exports" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<ExportsPage />)} />
            <Route path="/folders" element={withLazyPage(<FoldersPage />)} />
            <Route path="/albaranes" element={withLazyPage(<AlbaranesPage />)} />
            <Route path="/shopping" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<ShoppingListPage />)} />
            <Route path="/checklist" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<DailyChecklistPage />)} />
            <Route path="/chat" element={<Navigate to="/dashboard" replace />} />
            <Route path="/inventory" element={withLazyPage(<InventoryUnifiedPage />)} />
            <Route path="/inventory-facturacion" element={withLazyPage(<InventoryUnifiedPage />)} />
            <Route path="/control-operativo" element={withLazyPage(<OperationalControlPage />)} />
            <Route path="/dossier-trazabilidad" element={withLazyPage(<TraceabilityDossierPage />)} />
            <Route path="/despachos" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<FacturacionPage />)} />
            <Route path="/facturacion" element={isRestrictedUser ? <Navigate to="/dashboard" replace /> : withLazyPage(<BillingPaymentsPage />)} />
          </Route>

          {/* Catch all - redirect to calendar or login */}
          <Route
            path="*"
            element={
              <Navigate to={currentUser ? "/inicio-roles" : "/login"} replace />
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
