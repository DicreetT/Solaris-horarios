import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { USERS } from './constants';
import { toDateKey, formatTimeNow } from './utils/dateUtils';
import { fetchTimeDataFromSupabase, saveTimeEntryToSupabase } from './services/timeService';

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
  const [notifications, setNotifications] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminMode, setAdminMode] = useState(false);

  const [timeData, setTimeData] = useState({});
  const [trainingRequests, setTrainingRequests] = useState([]);
  const [todos, setTodos] = useState([]);
  const [meetingRequests, setMeetingRequests] = useState([]);
  const [absenceRequests, setAbsenceRequests] = useState([]);
  const [folderUpdates, setFolderUpdates] = useState({});

  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showMeetingAdmin, setShowMeetingAdmin] = useState(false);
  const [showAbsenceAdmin, setShowAbsenceAdmin] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // 👉 Horarios: cargar desde Supabase al arrancar
  useEffect(() => {
    async function loadRemoteTimes() {
      try {
        const remoteData = await fetchTimeDataFromSupabase();
        setTimeData(remoteData);
      } catch (e) {
        console.error("Error loading time data from Supabase", e);
      }
    }

    loadRemoteTimes();
  }, []);

  // Intentar recuperar sesión de Supabase al cargar la app
  useEffect(() => {
    async function loadAuthUser() {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        const email = data.user.email?.toLowerCase();
        const localUser = USERS.find((u) => u.email.toLowerCase() === email);
        if (localUser) {
          setCurrentUser(localUser);
          const today = new Date();
          setSelectedDate(today);
          setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
        }
      }
    }
    loadAuthUser();
  }, []);

  // 👉 Cargar datos relacionados con el usuario desde Supabase
  useEffect(() => {
    if (!currentUser) return;

    // To-Do: tabla "todos"
    async function loadTodosFromSupabase() {
      try {
        const { data, error } = await supabase
          .from("todos")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error loading todos from Supabase", error);
          return;
        }

        // Mapeamos filas de Supabase → objeto JS
        const mapped = data.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description || "",
          createdBy: row.created_by,
          assignedTo: row.assigned_to || [],
          createdAt: row.created_at,
          dueDateKey: row.due_date_key || null,
          completedBy: row.completed_by || [],
        }));

        // 🔎 Filtro por usuario en el FRONT
        let visibleTodos;
        if (currentUser.id === "thalia") {
          // Thalia ve TODO
          visibleTodos = mapped;
        } else {
          // El resto solo ve:
          // - tareas que ha creado
          // - tareas donde está en assignedTo
          visibleTodos = mapped.filter(
            (t) =>
              t.createdBy === currentUser.id ||
              (t.assignedTo || []).includes(currentUser.id)
          );
        }

        setTodos(visibleTodos);
      } catch (e) {
        console.error("Unexpected error loading todos", e);
      }
    }

    // Formación: tabla "training_requests"
    async function loadTrainingRequestsFromSupabase() {
      try {
        const { data, error } = await supabase
          .from("training_requests")
          .select("*");

        if (error) {
          console.error("Error loading training_requests", error);
          return;
        }

        const mapped = data.map((row) => ({
          id: row.id,
          userId: row.user_id,
          requestedDateKey: row.requested_date_key,
          scheduledDateKey: row.scheduled_date_key,
          status: row.status,
          comments: row.comments || [],
        }));

        setTrainingRequests(mapped);
      } catch (e) {
        console.error("Unexpected error loading training_requests", e);
      }
    }


    // Reuniones: tabla "meeting_requests"
    async function loadMeetingRequestsFromSupabase() {
      try {
        // Query base
        let query = supabase
          .from("meeting_requests")
          .select("*")
          .order("created_at", { ascending: false });

        // Si NO eres Thalia → solo reuniones que has creado tú
        // o donde estás en participants
        if (currentUser.id !== "thalia") {
          query = query.or(
            `created_by.eq.${currentUser.id},participants.cs.{${currentUser.id}}`
          );
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error loading meeting_requests", error);
          return;
        }

        const mapped = data.map((row) => ({
          id: row.id,
          createdBy: row.created_by,
          createdAt: row.created_at,
          title: row.title,
          description: row.description || "",
          preferredDateKey: row.preferred_date_key,
          preferredSlot: row.preferred_slot,
          participants: row.participants || [],
          status: row.status,
          scheduledDateKey: row.scheduled_date_key || null,
          scheduledTime: row.scheduled_time || "",
          responseMessage: row.response_message || "",
        }));

        setMeetingRequests(mapped);
      } catch (e) {
        console.error("Unexpected error loading meeting_requests", e);
      }
    }


    // Permisos especiales: tabla "absence_requests"
    async function loadAbsenceRequestsFromSupabase() {
      try {
        // Query base
        let query = supabase
          .from("absence_requests")
          .select("*")
          .order("created_at", { ascending: false });

        // Si NO eres Thalia → solo tus propios permisos
        if (currentUser.id !== "thalia") {
          query = query.eq("created_by", currentUser.id);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error loading absence_requests", error);
          return;
        }

        const mapped = data.map((row) => ({
          id: row.id,
          createdBy: row.created_by,
          createdAt: row.created_at,
          dateKey: row.date_key,
          reason: row.reason,
          status: row.status,
          responseMessage: row.response_message || "",
        }));

        setAbsenceRequests(mapped);
      } catch (e) {
        console.error("Unexpected error loading absence_requests", e);
      }
    }


    // Carpetas actualizadas: tabla "folder_updates"
    async function loadFolderUpdatesFromSupabase() {
      try {
        const { data, error } = await supabase
          .from("folder_updates")
          .select("*");

        if (error) {
          console.error("Error loading folder_updates", error);
          return;
        }

        const map = {};
        data.forEach((row) => {
          map[row.folder_id] = {
            author: row.author,
            at: row.at,
          };
        });
        setFolderUpdates(map);
      } catch (e) {
        console.error("Unexpected error loading folder_updates", e);
      }
    }

    // Notificaciones: tabla "notifications"
    async function loadNotificationsFromSupabase() {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error loading notifications", error);
          return;
        }

        const mapped = data.map((row) => ({
          id: row.id,
          message: row.message,
          createdAt: row.created_at,
          read: row.read,
        }));

        setNotifications(mapped);
      } catch (e) {
        console.error("Unexpected error loading notifications", e);
      }
    }

    loadTodosFromSupabase();
    loadTrainingRequestsFromSupabase();
    loadMeetingRequestsFromSupabase();
    loadAbsenceRequestsFromSupabase();
    loadFolderUpdatesFromSupabase();
    loadNotificationsFromSupabase();
  }, [currentUser]);

  async function deleteTrainingRequest(id) {
    try {
      const { error } = await supabase
        .from("training_requests")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("Error deleting training request", error);
        alert("Error al eliminar solicitud de formación");
      } else {
        setTrainingRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (e) {
      console.error("Unexpected error deleting training request", e);
    }
  }

  async function deleteMeetingRequest(id) {
    try {
      const { error } = await supabase
        .from("meeting_requests")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("Error deleting meeting request", error);
        alert("Error al eliminar solicitud de reunión");
      } else {
        setMeetingRequests((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (e) {
      console.error("Unexpected error deleting meeting request", e);
    }
  }

  async function deleteAbsenceRequest(id) {
    try {
      const { error } = await supabase
        .from("absence_requests")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("Error deleting absence request", error);
        alert("Error al eliminar solicitud de permiso especial");
      } else {
        setAbsenceRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (e) {
      console.error("Unexpected error deleting absence request", e);
    }
  }


  // --- Notificaciones (Supabase) ---
  async function addNotification(message, userIdOverride) {
    const userId = userIdOverride || currentUser?.id;
    if (!userId) return;

    const now = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          message,
          created_at: now,
          read: false,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating notification in Supabase", error);
        return;
      }

      const newNotif = {
        id: data.id,
        message: data.message,
        createdAt: data.created_at,
        read: data.read,
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, 100));
    } catch (e) {
      console.error("Unexpected error creating notification", e);
    }
  }

  async function markAllNotificationsRead() {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", currentUser.id)
        .eq("read", false);

      if (error) {
        console.error("Error marking notifications as read in Supabase", error);
      }
    } catch (e) {
      console.error("Unexpected error marking notifications read", e);
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function updateRecord(date, userId, updater) {
    const key = toDateKey(date);

    setTimeData((prev) => {
      const prevDay = prev[key] || {};
      const prevRecord = prevDay[userId] || {};
      const nextRecord = updater(prevRecord);

      // Guardar en Supabase usando el helper
      saveTimeEntryToSupabase(key, userId, nextRecord);

      return {
        ...prev,
        [key]: {
          ...prevDay,
          [userId]: nextRecord,
        },
      };
    });
  }

  function handleLogin(user) {
    setCurrentUser(user);
    setAdminMode(false);
    const today = new Date();
    setSelectedDate(today);
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));

    // Usamos user.id porque currentUser aún no está actualizado en este momento
    addNotification(
      `Has iniciado sesión como ${user.name}. ¡Buenos días! ☀️`,
      user.id
    );
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Error closing Supabase session", e);
    }
    setCurrentUser(null);
  }

  // Formación: crear solicitud (tabla training_requests)
  async function handleCreateTrainingRequest() {
    if (!currentUser || !selectedDate) return;
    const dateKey = toDateKey(selectedDate);

    // Evitar duplicados en el mismo día
    const already = trainingRequests.find(
      (r) => r.userId === currentUser.id && r.scheduledDateKey === dateKey
    );
    if (already) return;

    const record = {
      user_id: currentUser.id,
      requested_date_key: dateKey,
      scheduled_date_key: dateKey,
      status: "pending",
      comments: [],
    };

    try {
      const { data, error } = await supabase
        .from("training_requests")
        .insert(record)
        .select()
        .single();

      if (error) {
        console.error("Error creating training_request", error);
        return;
      }

      const mapped = {
        id: data.id,
        userId: data.user_id,
        requestedDateKey: data.requested_date_key,
        scheduledDateKey: data.scheduled_date_key,
        status: data.status,
        comments: data.comments || [],
      };

      setTrainingRequests((prev) => [...prev, mapped]);
      await addNotification(
        `Has solicitado formación para el día ${dateKey}.`
      );
    } catch (e) {
      console.error("Unexpected error creating training_request", e);
    }
  }

  // Formación: añadir comentario
  async function handleAddTrainingComment(requestId, text) {
    if (!currentUser) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const now = new Date();
    const stamp = now.toLocaleString("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const req = trainingRequests.find((r) => r.id === requestId);
    if (!req) return;

    const nextComments = [
      ...(req.comments || []),
      { by: currentUser.id, text: trimmed, at: stamp },
    ];

    try {
      const { error } = await supabase
        .from("training_requests")
        .update({ comments: nextComments })
        .eq("id", requestId);

      if (error) {
        console.error("Error updating training_request comments", error);
        return;
      }

      setTrainingRequests((prev) =>
        prev.map((r) =>
          r.id === requestId ? { ...r, comments: nextComments } : r
        )
      );
    } catch (e) {
      console.error("Unexpected error updating training_request comments", e);
    }
  }

  // Formación: aceptar (Esteban)
  async function handleAcceptTraining(id) {
    try {
      const { error } = await supabase
        .from("training_requests")
        .update({ status: "accepted" })
        .eq("id", id);

      if (error) {
        console.error("Error updating training_request status", error);
        return;
      }

      setTrainingRequests((prev) =>
        prev.map((req) => (req.id === id ? { ...req, status: "accepted" } : req))
      );
    } catch (e) {
      console.error("Unexpected error updating training_request status", e);
    }
  }

  // Formación: reprogramar (Esteban)
  async function handleRescheduleTraining(id) {
    const req = trainingRequests.find((r) => r.id === id);
    if (!req) return;
    const current = req.scheduledDateKey || req.requestedDateKey;
    const newDateStr = window.prompt(
      "Escribe la nueva fecha en formato AAAA-MM-DD",
      current
    );
    if (!newDateStr) return;

    try {
      const { error } = await supabase
        .from("training_requests")
        .update({
          status: "rescheduled",
          scheduled_date_key: newDateStr,
        })
        .eq("id", id);

      if (error) {
        console.error("Error rescheduling training_request", error);
        return;
      }

      setTrainingRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
              ...r,
              status: "rescheduled",
              scheduledDateKey: newDateStr,
            }
            : r
        )
      );
    } catch (e) {
      console.error("Unexpected error rescheduling training_request", e);
    }
  }

  // To-Do: crear tarea (tabla todos)
  async function handleCreateTodo({ title, description, dueDateKey, assignedTo }) {
    if (!currentUser) return;
    const now = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from("todos")
        .insert({
          title,
          description,
          created_by: currentUser.id,
          assigned_to: assignedTo,
          created_at: now,
          due_date_key: dueDateKey,
          completed_by: [],
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating todo in Supabase", error);
        return;
      }

      const newTodo = {
        id: data.id,
        title: data.title,
        description: data.description || "",
        createdBy: data.created_by,
        assignedTo: data.assigned_to || [],
        createdAt: data.created_at,
        dueDateKey: data.due_date_key || null,
        completedBy: data.completed_by || [],
      };

      setTodos((prev) => [newTodo, ...prev]);
      await addNotification(`Has creado la tarea: "${title}".`);
    } catch (e) {
      console.error("Unexpected error creating todo", e);
    }
  }

  // To-Do: marcar / desmarcar completado por la persona actual
  async function handleToggleTodoCompleted(todoId) {
    if (!currentUser) return;

    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;

    const isDone = todo.completedBy.includes(currentUser.id);
    const nextCompleted = isDone
      ? todo.completedBy.filter((id) => id !== currentUser.id)
      : [...todo.completedBy, currentUser.id];

    try {
      const { error } = await supabase
        .from("todos")
        .update({ completed_by: nextCompleted })
        .eq("id", todoId);

      if (error) {
        console.error("Error updating todo completion in Supabase", error);
        return;
      }

      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoId ? { ...t, completedBy: nextCompleted } : t
        )
      );
    } catch (e) {
      console.error("Unexpected error updating todo completion", e);
    }
  }

  async function handleDeleteTodo(id) {
    try {
      const { error } = await supabase.from("todos").delete().eq("id", id);
      if (error) {
        console.error("Error deleting todo", error);
        alert("Error al eliminar tarea");
      } else {
        setTodos((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (e) {
      console.error("Unexpected error deleting todo", e);
    }
  }

  // Reuniones: crear solicitud (tabla meeting_requests)
  async function handleCreateMeetingRequest(payload) {
    if (!currentUser) return;
    const now = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from("meeting_requests")
        .insert({
          created_by: currentUser.id,
          created_at: now,
          title: payload.title,
          description: payload.description,
          preferred_date_key: payload.preferredDateKey,
          preferred_slot: payload.preferredSlot,
          participants: payload.participants,
          status: "pending",
          scheduled_date_key: null,
          scheduled_time: "",
          response_message: "",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating meeting_request", error);
        return;
      }

      const mapped = {
        id: data.id,
        createdBy: data.created_by,
        createdAt: data.created_at,
        title: data.title,
        description: data.description || "",
        preferredDateKey: data.preferred_date_key,
        preferredSlot: data.preferred_slot,
        participants: data.participants || [],
        status: data.status,
        scheduledDateKey: data.scheduled_date_key || null,
        scheduledTime: data.scheduled_time || "",
        responseMessage: data.response_message || "",
      };

      setMeetingRequests((prev) => [mapped, ...prev]);
    } catch (e) {
      console.error("Unexpected error creating meeting_request", e);
    }
  }

  // Reuniones: actualizar estado (Thalia)
  async function handleUpdateMeetingStatus(id, updates) {
    const dbUpdates = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.scheduledDateKey !== undefined)
      dbUpdates.scheduled_date_key = updates.scheduledDateKey;
    if (updates.scheduledTime !== undefined)
      dbUpdates.scheduled_time = updates.scheduledTime;
    if (updates.responseMessage !== undefined)
      dbUpdates.response_message = updates.responseMessage;

    try {
      const { error } = await supabase
        .from("meeting_requests")
        .update(dbUpdates)
        .eq("id", id);

      if (error) {
        console.error("Error updating meeting_request", error);
        return;
      }

      setMeetingRequests((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    } catch (e) {
      console.error("Unexpected error updating meeting_request", e);
    }
  }

  // Permisos especiales de ausencia: crear solicitud (tabla absence_requests)
  async function handleCreateAbsenceRequest(reason) {
    if (!currentUser || !selectedDate) return;
    const now = new Date().toISOString();
    const dateKey = toDateKey(selectedDate);

    try {
      const { data, error } = await supabase
        .from("absence_requests")
        .insert({
          created_by: currentUser.id,
          created_at: now,
          date_key: dateKey,
          reason,
          status: "pending",
          response_message: "",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating absence_request", error);
        return;
      }

      const mapped = {
        id: data.id,
        createdBy: data.created_by,
        createdAt: data.created_at,
        dateKey: data.date_key,
        reason: data.reason,
        status: data.status,
        responseMessage: data.response_message || "",
      };

      setAbsenceRequests((prev) => [mapped, ...prev]);

      await addNotification(
        `Has solicitado un permiso especial para el día ${dateKey}.`
      );
    } catch (e) {
      console.error("Unexpected error creating absence_request", e);
    }
  }

  // Permisos especiales: actualizar estado (Thalia)
  async function handleUpdateAbsenceStatus(id, updates) {
    const dbUpdates = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.responseMessage !== undefined)
      dbUpdates.response_message = updates.responseMessage;

    try {
      const { error } = await supabase
        .from("absence_requests")
        .update(dbUpdates)
        .eq("id", id);

      if (error) {
        console.error("Error updating absence_request", error);
        return;
      }

      setAbsenceRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      );

      await addNotification(`Has cambiado el estado de un permiso especial.`);
    } catch (e) {
      console.error("Unexpected error updating absence_request", e);
    }
  }

  // Carpetas compartidas: abrir carpeta (simple)
  function handleOpenFolder(folder) {
    window.open(folder.url, "_blank");
  }

  // Carpetas compartidas: Thalia marca / desmarca novedades globales (tabla folder_updates)
  async function handleMarkFolderUpdated(folderId) {
    const hasUpdate = !!folderUpdates[folderId];

    try {
      if (hasUpdate) {
        const { error } = await supabase
          .from("folder_updates")
          .delete()
          .eq("folder_id", folderId);

        if (error) {
          console.error("Error deleting folder_update", error);
          return;
        }

        setFolderUpdates((prev) => {
          const { [folderId]: _, ...rest } = prev;
          return rest;
        });
      } else {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("folder_updates")
          .insert({
            folder_id: folderId,
            author: currentUser?.name || "Thalia",
            at: now,
          })
          .select()
          .single();

        if (error) {
          console.error("Error inserting folder_update", error);
          return;
        }

        setFolderUpdates((prev) => ({
          ...prev,
          [data.folder_id]: {
            author: data.author,
            at: data.at,
          },
        }));
      }
    } catch (e) {
      console.error("Unexpected error handling folder_update", e);
    }
  }

  if (!currentUser) {
    return <LoginView onLogin={handleLogin} />;
  }

  const isAdmin = currentUser.canAdminHours && adminMode;
  const isTrainingManager = !!currentUser.isTrainingManager;
  const canRequestTraining = !isTrainingManager;

  const dateKey = selectedDate ? toDateKey(selectedDate) : null;

  const trainingRequestsForDay = dateKey
    ? trainingRequests.filter((r) => r.scheduledDateKey === dateKey)
    : [];

  const meetingRequestsForUser = meetingRequests.filter(
    (m) =>
      m.createdBy === currentUser.id ||
      (m.participants || []).includes(currentUser.id)
  );

  const absenceRequestsForDay = dateKey
    ? absenceRequests.filter(
      (r) => r.createdBy === currentUser.id && r.dateKey === dateKey
    )
    : [];

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
            <NotificationBell
              notifications={notifications}
              onMarkAllRead={markAllNotificationsRead}
            />
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
            onClick={handleLogout}
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
            userId={currentUser.id}
            data={timeData}
            onChangeMonth={setMonthDate}
            onSelectDate={setSelectedDate}
            isAdminView={isAdmin}
            trainingRequests={trainingRequests}
            currentUser={currentUser}
          />
          {currentUser.canAdminHours && adminMode && (
            <AdminExportView data={timeData} />
          )}
        </div>

        {/* Columna derecha: detalle del día + extras */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DayDetail
            user={currentUser}
            date={selectedDate}
            data={timeData}
            isAdminView={isAdmin}
            isTrainingManager={isTrainingManager}
            canRequestTraining={canRequestTraining}
            trainingRequestsForDay={trainingRequestsForDay}
            onCreateTrainingRequest={handleCreateTrainingRequest}
            onAcceptTraining={handleAcceptTraining}
            onRescheduleTraining={handleRescheduleTraining}
            onAddTrainingComment={handleAddTrainingComment}
            meetingRequestsForUser={meetingRequestsForUser}
            onCreateMeetingRequest={handleCreateMeetingRequest}
            absenceRequestsForDay={absenceRequestsForDay}
            onCreateAbsenceRequest={handleCreateAbsenceRequest}
            onDeleteTrainingRequest={deleteTrainingRequest}
            onDeleteMeetingRequest={deleteMeetingRequest}
            onDeleteAbsenceRequest={deleteAbsenceRequest}
            onMarkEntry={() => {
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                entry: formatTimeNow(),
                status: "present",
              }));
              addNotification(
                `Has fichado tu entrada (${formatTimeNow()}).`
              );
            }}
            onMarkExit={() => {
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                exit: formatTimeNow(),
                status: r.status || "present",
              }));
              addNotification(
                `Has fichado tu salida (${formatTimeNow()}). ¡Hasta luego! 🌙`
              );
            }}
            onMarkAbsent={() =>
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                status: "absent",
              }))
            }
            onRequestVacation={() =>
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                status: "vacation-request",
              }))
            }
            onApproveVacation={(userId) =>
              updateRecord(selectedDate, userId, (r) => ({
                ...r,
                status: "vacation",
              }))
            }
            onUpdateNote={(note) =>
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                note,
              }))
            }
            onCancelVacationRequest={() =>
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                status: null,   // 👈 quitamos la solicitud
              }))
            }
          />

          {/* Carpetas de Drive */}
          <SharedFoldersPanel
            currentUser={currentUser}
            folderUpdates={folderUpdates}
            onOpenFolder={handleOpenFolder}
            onMarkFolderUpdated={handleMarkFolderUpdated}
          />

          {/* Panel de exportaciones solo para Thalia */}
          {isThalia && (
            <GlobalExportPanel
              timeData={timeData}
              trainingRequests={trainingRequests}
              meetingRequests={meetingRequests}
              absenceRequests={absenceRequests}
              todos={todos}
            />
          )}
        </div>
      </div>

      {/* Modales globales */}
      {showTodoModal && (
        <TodoModal
          currentUser={currentUser}
          todos={todos}
          onClose={() => setShowTodoModal(false)}
          onCreateTodo={handleCreateTodo}
          onToggleTodoCompleted={handleToggleTodoCompleted}
          onDeleteTodo={handleDeleteTodo}
        />
      )}

      {showAdminDashboard && (
        <AdminDashboard
          todos={todos}
          onClose={() => setShowAdminDashboard(false)}
        />
      )}

      {showMeetingAdmin && (
        <MeetingAdminModal
          meetingRequests={meetingRequests}
          onClose={() => setShowMeetingAdmin(false)}
          onUpdateMeetingStatus={handleUpdateMeetingStatus}
        />
      )}

      {showAbsenceAdmin && (
        <AbsenceAdminModal
          absenceRequests={absenceRequests}
          onClose={() => setShowAbsenceAdmin(false)}
          onUpdateAbsenceStatus={handleUpdateAbsenceStatus}
        />
      )}
    </div>
  );
}

export default App;
