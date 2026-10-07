import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// Components
import LoginView from './components/LoginView';
import Layout from './components/Layout';
import { InstallPWAPrompt } from './components/InstallPWAPrompt';
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
  return <Suspense fallback={<RouteLoadingFallback />}>{page}</Suspense>;
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

        {/* PWA Install Prompt */}
        <InstallPWAPrompt />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
