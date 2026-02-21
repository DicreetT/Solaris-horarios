import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// Components
import LoginView from './components/LoginView';
import Layout from './components/Layout';
import { InstallPWAPrompt } from './components/InstallPWAPrompt';
import { NotificationsProvider } from './context/NotificationsContext';

// Pages
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'));
const TasksPage = React.lazy(() => import('./pages/TasksPage'));
const MeetingsPage = React.lazy(() => import('./pages/MeetingsPage'));
const AbsencesPage = React.lazy(() => import('./pages/AbsencesPage'));
const TrainingsPage = React.lazy(() => import('./pages/TrainingsPage'));
const ExportsPage = React.lazy(() => import('./pages/ExportsPage'));
const TimeTrackingPage = React.lazy(() => import('./pages/TimeTrackingPage'));
const FoldersPage = React.lazy(() => import('./pages/FoldersPage'));
const ShoppingListPage = React.lazy(() => import('./pages/ShoppingListPage'));
const DailyChecklistPage = React.lazy(() => import('./pages/DailyChecklistPage'));
const ChatPage = React.lazy(() => import('./pages/ChatPage'));
const InventoryPage = React.lazy(() => import('./pages/InventoryPage'));
const InventoryFacturacionPage = React.lazy(() => import('./pages/InventoryFacturacionPage'));

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
                <Navigate to="/calendar" replace />
              ) : (
                <LoginView onLogin={handleLogin} />
              )
            }
          />

          {/* Redirect root to calendar or login */}
          <Route
            path="/"
            element={
              <Navigate to={currentUser ? "/calendar" : "/login"} replace />
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
            <Route path="/calendar" element={withLazyPage(<CalendarPage />)} />
            <Route path="/tasks" element={withLazyPage(<TasksPage />)} />
            <Route path="/meetings" element={withLazyPage(<MeetingsPage />)} />
            <Route path="/absences" element={withLazyPage(<AbsencesPage />)} />
            <Route path="/trainings" element={withLazyPage(<TrainingsPage />)} />
            <Route path="/time-tracking" element={withLazyPage(<TimeTrackingPage />)} />
            <Route path="/exports" element={withLazyPage(<ExportsPage />)} />
            <Route path="/folders" element={withLazyPage(<FoldersPage />)} />
            <Route path="/shopping" element={withLazyPage(<ShoppingListPage />)} />
            <Route path="/checklist" element={withLazyPage(<DailyChecklistPage />)} />
            <Route path="/chat" element={withLazyPage(<ChatPage />)} />
            <Route path="/inventory" element={withLazyPage(<InventoryPage />)} />
            <Route path="/inventory-facturacion" element={withLazyPage(<InventoryFacturacionPage />)} />
          </Route>

          {/* Catch all - redirect to calendar or login */}
          <Route
            path="*"
            element={
              <Navigate to={currentUser ? "/calendar" : "/login"} replace />
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
