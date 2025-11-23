import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Components
import LoginView from './components/LoginView';
import Layout from './components/Layout';
import { InstallPWAPrompt } from './components/InstallPWAPrompt';

// Pages
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import TasksPage from './pages/TasksPage';
import MeetingsPage from './pages/MeetingsPage';
import AbsencesPage from './pages/AbsencesPage';
import TrainingsPage from './pages/TrainingsPage';
import ExportsPage from './pages/ExportsPage';
import TimeTrackingPage from './pages/TimeTrackingPage';
import FoldersPage from './pages/FoldersPage';

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

import { usePushNotifications } from './hooks/usePushNotifications';
import { User } from './types';

/**
 * App principal with routing
 */
function App() {
  const { currentUser, login } = useAuth();
  usePushNotifications(currentUser); // Auto-subscribe logic runs here

  const handleLogin = (user: User) => {
    login(user);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Login route */}
        <Route
          path="/login"
          element={
            currentUser ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginView onLogin={handleLogin} />
            )
          }
        />

        {/* Redirect root to dashboard or login */}
        <Route
          path="/"
          element={
            <Navigate to={currentUser ? "/dashboard" : "/login"} replace />
          }
        />

        {/* All authenticated routes use the Layout and ProtectedRoute */}
        <Route element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/absences" element={<AbsencesPage />} />
          <Route path="/trainings" element={<TrainingsPage />} />
          <Route path="/time-tracking" element={<TimeTrackingPage />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/folders" element={<FoldersPage />} />
        </Route>

        {/* Catch all - redirect to dashboard or login */}
        <Route
          path="*"
          element={
            <Navigate to={currentUser ? "/dashboard" : "/login"} replace />
          }
        />
      </Routes>

      {/* PWA Install Prompt */}
      <InstallPWAPrompt />
    </BrowserRouter>
  );
}

export default App;
