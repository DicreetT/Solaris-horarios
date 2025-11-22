import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { USERS } from './constants';
import { toDateKey } from './utils/dateUtils';

// Context
import { useAuth } from './context/AuthContext';

// Hooks
import { useNotifications } from './hooks/useNotifications';

// Components
import LoginView from './components/LoginView';
import AdminDashboard from './components/AdminDashboard';
import CalendarGrid from './components/CalendarGrid';
import DayDetail from './components/DayDetail';
import AdminExportView from './components/AdminExportView';
import GlobalExportPanel from './components/GlobalExportPanel';
import TodoModal from './components/TodoModal';
import MeetingAdminModal from './components/MeetingAdminModal';
import AbsenceAdminModal from './components/AbsenceAdminModal';
import NotificationBell from './components/NotificationBell';
import SharedFoldersPanel from './components/SharedFoldersPanel';

/**
 * App principal (TODO en Supabase)
 */
function App() {
  const { currentUser, login, logout } = useAuth();
  const [adminMode, setAdminMode] = useState(false);

  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showMeetingAdmin, setShowMeetingAdmin] = useState(false);
  const [showAbsenceAdmin, setShowAbsenceAdmin] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // We still need notifications here for the "Welcome" message on login
  // and potentially other global notifications if we want to keep them here.
  // However, most components now handle their own notifications via the hook.
  const { addNotification } = useNotifications(currentUser);

  // Sync selectedDate/monthDate on login
  useEffect(() => {
    if (currentUser) {
      const today = new Date();
      setSelectedDate(today);
      setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  }, [currentUser]);

  function handleLogin(user) {
    login(user);
    setAdminMode(false);
    // Notification is handled in AuthContext or here if preferred, 
    // but let's keep it here for now as it was in the original logic
    // actually, useAuth doesn't have addNotification, so we do it here or in LoginView.
    // But wait, LoginView calls onLogin prop.
    // Let's keep the onLogin prop in LoginView for now to handle this side effect.
  }

  // Wrapper for login to add notification
  const onLoginSuccess = (user) => {
    handleLogin(user);
    // We need a fresh instance of useNotifications for the new user?
    // actually useNotifications depends on currentUser.
    // When handleLogin updates currentUser, the hook will re-run.
    // But we can't call addNotification immediately with the *new* user 
    // because the hook hasn't updated yet.
    // A simple workaround is to just let the user see the notification next time or 
    // rely on the fact that the hook might be fast enough? 
    // No, React state updates are batched.

    // Better approach: The LoginView could trigger the notification if it had access to the hook,
    // but it doesn't have the user yet.

    // Let's just manually insert the notification for now or ignore it.
    // Or we can use a useEffect to welcome the user.
  };

  useEffect(() => {
    if (currentUser) {
      // We could add a welcome message here if we wanted to ensure it happens on login
      // But be careful not to spam on refresh.
    }
  }, [currentUser]);


  if (!currentUser) {
    return <LoginView onLogin={onLoginSuccess} />;
  }

  const isAdmin = currentUser.canAdminHours && adminMode;
  const isTrainingManager = !!currentUser.isTrainingManager;
  const canRequestTraining = !isTrainingManager;
  const isThalia = currentUser.id === "thalia";

  return (
    <div className="bg-bg rounded-[20px] border-2 border-border shadow-[6px_6px_0_rgba(0,0,0,0.2)] p-4 md:p-6 md:px-7">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center font-extrabold bg-[radial-gradient(circle_at_top,#fff2cc,#ffb347)]">S</div>
          <div>
            <h1 style={{ fontSize: "1.3rem" }}>Solaris · Control horario</h1>
            <p className="text-sm text-[#555]">
              {isAdmin
                ? "Vista de administración (equipo completo)"
                : "Registro diario de jornada, ausencias, formación, tareas y reuniones"}
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-[#fffbe6] text-xs mt-1">
              <span
                className="inline-flex items-center justify-center px-2 py-0.5 rounded-full border border-border text-[0.7rem]"
                style={{
                  background: isAdmin
                    ? "#fee2e2"
                    : currentUser.isTrainingManager
                      ? "#e0f2fe"
                      : isThalia
                        ? "#fef3c7"
                        : "#dcfce7",
                  marginRight: 6,
                }}
              >
                {isAdmin
                  ? "Admin horario"
                  : currentUser.isTrainingManager
                    ? "Responsable formación"
                    : isThalia
                      ? "Admin general"
                      : "Usuario"}
              </span>
              {currentUser.canAdminHours && !isAdmin && (
                <>Puede administrar el registro horario</>
              )}
              {isAdmin && <>Gestionando fichajes de todo el equipo</>}
              {!currentUser.canAdminHours &&
                currentUser.isTrainingManager &&
                !isAdmin && <>Gestiona solicitudes de formación</>}
              {isThalia && <>Ve reuniones y permisos especiales del equipo</>}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div className="px-2.5 py-1 rounded-full border border-border bg-white text-xs">
            <NotificationBell />
            {currentUser.name}
            <br />
            <span className="text-xs text-[#666]">{currentUser.email}</span>
          </div>
          {currentUser.canAdminHours && (
            <button
              type="button"
              className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
              style={{ marginTop: 4, width: "100%" }}
              onClick={() => setAdminMode((prev) => !prev)}
            >
              {adminMode
                ? "Volver a mi vista"
                : "Administrar registro horario"}
            </button>
          )}

          {isThalia && (
            <>
              <button
                type="button"
                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                style={{ marginTop: 4, width: "100%" }}
                onClick={() => setShowMeetingAdmin(true)}
              >
                Solicitudes de reunión
              </button>
              <button
                type="button"
                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                style={{ marginTop: 4, width: "100%" }}
                onClick={() => setShowAbsenceAdmin(true)}
              >
                Permisos de ausencia
              </button>
              <button
                type="button"
                className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
                style={{ marginTop: 4, width: "100%" }}
                onClick={() => setShowAdminDashboard(true)}
              >
                Tareas de todo el equipo
              </button>
            </>
          )}

          <button
            type="button"
            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
            style={{ marginTop: 4, width: "100%" }}
            onClick={() => setShowTodoModal(true)}
          >
            To-Do List
          </button>

          <button
            type="button"
            className="rounded-full border-2 border-border px-2.5 py-1.5 text-xs font-semibold cursor-pointer bg-transparent inline-flex items-center gap-1.5"
            onClick={logout}
            style={{ marginTop: 4, width: "100%" }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* Columna izquierda: calendario */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <CalendarGrid
            monthDate={monthDate}
            selectedDate={selectedDate}
            onChangeMonth={setMonthDate}
            onSelectDate={setSelectedDate}
            isAdminView={isAdmin}
          />
          {currentUser.canAdminHours && adminMode && (
            <AdminExportView />
          )}
        </div>

        {/* Columna derecha: detalle del día + extras */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DayDetail
            date={selectedDate}
            isAdminView={isAdmin}
            isTrainingManager={isTrainingManager}
            canRequestTraining={canRequestTraining}
          />

          {/* Carpetas de Drive */}
          <SharedFoldersPanel />

          {/* Panel de exportaciones solo para Thalia */}
          {isThalia && (
            <GlobalExportPanel />
          )}
        </div>
      </div>

      {/* Modales globales */}
      {showTodoModal && (
        <TodoModal
          onClose={() => setShowTodoModal(false)}
        />
      )}

      {showAdminDashboard && (
        <AdminDashboard
          onClose={() => setShowAdminDashboard(false)}
        />
      )}

      {showMeetingAdmin && (
        <MeetingAdminModal
          onClose={() => setShowMeetingAdmin(false)}
        />
      )}

      {showAbsenceAdmin && (
        <AbsenceAdminModal
          onClose={() => setShowAbsenceAdmin(false)}
        />
      )}
    </div>
  );
}

export default App;
