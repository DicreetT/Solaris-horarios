const { useState, useEffect } = React;

/**
 * Usuarios "reales" de momento simulados.
 * Luego esto lo sacaremos de Supabase Auth.
 */
const USERS = [
  {
    id: "anabella",
    name: "Anabella",
    role: "Operativa",
    email: "anabella@empresa.com",
    password: "anabella123",
    canAdminHours: true, // puede ver panel de administración de registro horario
    isTrainingManager: false,
  },
  {
    id: "esteban",
    name: "Esteban",
    role: "Operativo",
    email: "esteban@empresa.com",
    password: "esteban123",
    canAdminHours: false,
    isTrainingManager: true, // responsable de formación
  },
  {
    id: "itzi",
    name: "Itzi",
    role: "Operativa",
    email: "itzi@empresa.com",
    password: "itzi123",
    canAdminHours: false,
    isTrainingManager: false,
  },
  {
    id: "fer",
    name: "Fer",
    role: "Operativo",
    email: "fer@empresa.com",
    password: "fer123",
    canAdminHours: false,
    isTrainingManager: false,
  },
];

/**
 * Data de fichajes en localStorage
 * Estructura:
 *  timeData = {
 *    "2025-02-01": {
 *       "anabella": { entry, exit, status, note },
 *       "esteban": { ... }
 *    },
 *    ...
 *  }
 */
const STORAGE_KEY_TIMES = "solaris_times_v1";

/**
 * Data de solicitudes de formación en localStorage
 * Estructura:
 *  trainingRequests = [
 *    {
 *      id,
 *      userId,
 *      requestedDateKey,  // día en el que lo pidió
 *      scheduledDateKey,  // día para el que está programado
 *      status: "pending" | "accepted" | "rescheduled"
 *    },
 *    ...
 *  ]
 */
const STORAGE_KEY_TRAININGS = "solaris_trainings_v1";

function loadTimeData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TIMES);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error loading time data", e);
    return {};
  }
}

function saveTimeData(data) {
  localStorage.setItem(STORAGE_KEY_TIMES, JSON.stringify(data));
}

function loadTrainingRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRAININGS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error loading training requests", e);
    return [];
  }
}

function saveTrainingRequests(list) {
  localStorage.setItem(STORAGE_KEY_TRAININGS, JSON.stringify(list));
}

// Helpers fecha/hora
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDatePretty(date) {
  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTimeNow() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function getStatusBadgeProps(status) {
  if (status === "absent")
    return { label: "Ausencia", className: "status-absent" };
  if (status === "vacation")
    return { label: "Vacaciones", className: "status-vacation" };
  if (status === "vacation-request")
    return { label: "Vacaciones (pendiente)", className: "status-vacation" };
  if (status === "present")
    return { label: "Presente", className: "status-present" };
  return null;
}

/**
 * Login por email y contraseña (simulado).
 * Más adelante esto hablará con Supabase Auth.
 */
function LoginView({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const user = USERS.find(
      (u) =>
        u.email.toLowerCase() === email.trim().toLowerCase() &&
        u.password === password
    );
    if (!user) {
      setError("Correo o contraseña incorrectos");
      return;
    }
    setError("");
    onLogin(user);
  }

  return (
    <div className="app-card">
      <div className="app-header">
        <div className="logo-title">
          <div className="fake-logo">S</div>
          <div>
            <h1 style={{ fontSize: "1.4rem" }}>Solaris · Control horario</h1>
            <p className="subtitle">
              Inicia sesión con tu correo de empresa para fichar y gestionar el
              día a día.
            </p>
          </div>
        </div>
      </div>

      <div className="separator" />

      <form onSubmit={handleSubmit}>
        <p className="login-description">
          Escribe tu <strong>correo</strong> y <strong>contraseña</strong>.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label className="field-label">Correo</label>
            <input
              className="input"
              type="email"
              placeholder="nombre@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">Contraseña</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        {error && (
          <p
            style={{
              color: "#b91c1c",
              fontSize: "0.8rem",
              marginTop: 6,
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-full"
          style={{ marginTop: 12 }}
        >
          Entrar
        </button>
      </form>

      <p className="login-help">
        (De momento usuarios de prueba: <br />
        <strong>Anabella</strong>: anabella@empresa.com / anabella123 <br />
        <strong>Esteban</strong>: esteban@empresa.com / esteban123 <br />
        <strong>Itzi</strong>: itzi@empresa.com / itzi123 <br />
        <strong>Fer</strong>: fer@empresa.com / fer123)
      </p>

      <div className="panel">
        <strong>Notas:</strong>
        <ul style={{ paddingLeft: 18, margin: "4px 0", fontSize: "0.8rem" }}>
          <li>Los datos se guardan solo en este navegador (localStorage).</li>
          <li>
            Más adelante, la misma app usará Supabase para login real y guardar
            todo en la nube.
          </li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Calendario mensual
 */
function CalendarGrid({
  monthDate,
  selectedDate,
  userId,
  data,
  onChangeMonth,
  onSelectDate,
  isAdminView,
  trainingRequests,
  currentUser,
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // Lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const isSameDate = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const weeks = [];
  let currentDay = 1 - firstWeekday;
  while (currentDay <= daysInMonth) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      if (currentDay < 1 || currentDay > daysInMonth) {
        row.push(null);
      } else {
        const date = new Date(year, month, currentDay);
        row.push(date);
      }
      currentDay++;
    }
    weeks.push(row);
  }

  const dayNames = ["L", "M", "X", "J", "V", "S", "D"];

  const getDotForDay = (date) => {
    const key = toDateKey(date);
    const byDay = data[key];
    const isTrainingManager = currentUser?.isTrainingManager;

    // 1) Vista ADMIN: resumen del equipo (fichajes / ausencias / vacaciones)
    if (isAdminView) {
      if (!byDay) return null;
      let hasVacation = false;
      let hasVacationReq = false;
      let hasAbsence = false;
      let hasPresent = false;

      USERS.forEach((u) => {
        const record = byDay[u.id];
        if (!record) return;
        if (record.status === "vacation") hasVacation = true;
        if (record.status === "vacation-request") hasVacationReq = true;
        if (record.status === "absent") hasAbsence = true;
        if (record.entry || record.exit) hasPresent = true;
      });

      if (hasVacation || hasVacationReq) return "vacation";
      if (hasAbsence) return "absent";
      if (hasPresent) return "present";
      return null;
    }

    // 2) Vista de Esteban (responsable de formación):
    //    ve puntito morado en todos los días con alguna formación programada
    if (isTrainingManager) {
      const hasTrainingForDay = trainingRequests.some(
        (r) => r.scheduledDateKey === key
      );
      if (hasTrainingForDay) return "training";
    } else {
      // 3) Vista de usuario normal:
      //    ve puntito morado en los días donde ÉL/ELLA tiene formación
      const hasMyTrainingForDay = trainingRequests.some(
        (r) => r.userId === userId && r.scheduledDateKey === key
      );
      if (hasMyTrainingForDay) return "training";
    }

    // 4) Dots normales de fichaje / ausencias / vacaciones
    const record = byDay?.[userId];
    if (!record) return null;
    if (record.status === "absent") return "absent";
    if (record.status === "vacation" || record.status === "vacation-request")
      return "vacation";
    if (record.entry || record.exit) return "present";
    return null;
  };

  return (
    <div className="calendar-card">
      <div className="calendar-header">
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => onChangeMonth(new Date(year, month - 1, 1))}
        >
          ←
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700 }}>
            {monthDate.toLocaleDateString("es-ES", {
              month: "long",
              year: "numeric",
            })}
          </div>
          <div className="small-muted">
            Toca un día para ver o editar sus datos.
          </div>
          <div className="small-muted">
            Días con formación → puntito morado en el calendario.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => onChangeMonth(new Date(year, month + 1, 1))}
        >
          →
        </button>
      </div>

      <div className="calendar-grid">
        {dayNames.map((n) => (
          <div key={n} className="day-name">
            {n}
          </div>
        ))}
        {weeks.map((week, wi) =>
          week.map((date, di) => {
            if (!date) {
              return (
                <div key={`${wi}-${di}`} className="day-cell empty" />
              );
            }

            const isToday = isSameDate(date, today);
            const isSelected = selectedDate && isSameDate(date, selectedDate);
            const dot = getDotForDay(date);

            let badgeClass = "";
            if (dot === "present") badgeClass = "day-badge";
            if (dot === "absent") badgeClass = "day-badge day-badge-absent";
            if (dot === "vacation")
              badgeClass = "day-badge day-badge-vacation";
            if (dot === "training")
              badgeClass = "day-badge day-badge-training";

            return (
              <button
                key={`${wi}-${di}`}
                type="button"
                className={
                  "day-cell" +
                  (isToday ? " today" : "") +
                  (isSelected ? " selected" : "")
                }
                onClick={() => onSelectDate(date)}
              >
                {date.getDate()}
                {dot && <span className={badgeClass} />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Panel día: vista admin o vista usuario normal (con formación)
 */
function DayDetail({
  user,
  date,
  data,
  onMarkEntry,
  onMarkExit,
  onMarkAbsent,
  onRequestVacation,
  onApproveVacation,
  onUpdateNote,
  isAdminView,
  isTrainingManager,
  canRequestTraining,
  trainingRequestsForDay,
  onCreateTrainingRequest,
  onAcceptTraining,
  onRescheduleTraining,
}) {
  if (!date) {
    return (
      <div className="day-card">
        <h3>Sin día seleccionado</h3>
        <p className="small-muted">
          Elige un día del calendario para ver o registrar información.
        </p>
      </div>
    );
  }

  const key = toDateKey(date);
  const byDay = data[key] || {};

  // --- Vista ADMIN: resumen de todo el equipo ---
  if (isAdminView) {
    return (
      <div className="day-card">
        <h3>Resumen del día</h3>
        <div className="day-date">{formatDatePretty(date)}</div>

        {USERS.map((u) => {
          const record = byDay[u.id] || {};
          const statusProps = getStatusBadgeProps(record.status);
          return (
            <div
              key={u.id}
              style={{
                borderTop: "1px solid #eee",
                paddingTop: 6,
                marginTop: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong>{u.name}</strong>
                {statusProps && (
                  <div
                    className={"status-tag " + statusProps.className}
                  >
                    {statusProps.label}
                  </div>
                )}
              </div>
              <div className="field-label">Entrada</div>
              <div className="field-value">
                {record.entry || (
                  <span className="small-muted">No registrada</span>
                )}
              </div>
              <div className="field-label">Salida</div>
              <div className="field-value">
                {record.exit || (
                  <span className="small-muted">No registrada</span>
                )}
              </div>
              {record.note && (
                <>
                  <div className="field-label">Nota</div>
                  <div className="field-value">{record.note}</div>
                </>
              )}
              {record.status === "vacation-request" && (
                <div style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    onClick={() => onApproveVacation(u.id)}
                  >
                    Aprobar vacaciones
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <p className="small-muted" style={{ marginTop: 8 }}>
          Los cambios de entrada/salida, ausencias y notas los hace cada persona
          desde su propio usuario. Aquí solo puedes aprobar vacaciones y
          revisar.
        </p>
      </div>
    );
  }

  // --- Vista USUARIO normal ---
  const record = byDay[user.id] || {};
  const statusProps = getStatusBadgeProps(record.status);

  // --- Formación: lógica distinta según rol ---
  const myTrainingForDay = trainingRequestsForDay.filter(
    (req) => req.userId === user.id
  );

  return (
    <div className="day-card">
      <h3>{user.name}</h3>
      <div className="day-date">{formatDatePretty(date)}</div>

      {statusProps && (
        <div className={"status-tag " + statusProps.className}>
          {statusProps.label}
        </div>
      )}

      {/* Panel de formación */}
      {isTrainingManager ? (
        <div className="training-panel">
          <strong>Solicitudes de formación</strong>
          {trainingRequestsForDay.length === 0 ? (
            <p className="small-muted">
              No hay solicitudes de formación para este día.
            </p>
          ) : (
            trainingRequestsForDay.map((req) => {
              const person = USERS.find((u) => u.id === req.userId);
              return (
                <div key={req.id} className="training-item">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      <strong>{person?.name || req.userId}</strong>
                    </span>
                    <span className="badge-info">
                      {req.status === "pending" && "Pendiente"}
                      {req.status === "accepted" && "Aceptada"}
                      {req.status === "rescheduled" && "Reprogramada"}
                    </span>
                  </div>
                  {req.status === "rescheduled" && req.scheduledDateKey !== req.requestedDateKey && (
                    <p className="small-muted">
                      Reprogramada para el día {req.scheduledDateKey}.
                    </p>
                  )}
                  <div
                    style={{ display: "flex", gap: 6, marginTop: 4 }}
                  >
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => onAcceptTraining(req.id)}
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-ghost"
                      onClick={() => onRescheduleTraining(req.id)}
                    >
                      Reprogramar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        canRequestTraining && (
          <div className="training-panel">
            <strong>Formación en servicios digitales</strong>
            {myTrainingForDay.length === 0 ? (
              <>
                <p className="small-muted">
                  Puedes solicitar una formación para este día. Esteban revisará
                  y la aceptará o te propondrá otra fecha.
                </p>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={onCreateTrainingRequest}
                >
                  Solicitar formación
                </button>
              </>
            ) : (
              myTrainingForDay.map((req) => (
                <div key={req.id} className="training-item">
                  <p className="small-muted">
                    Has solicitado formación para este día.
                  </p>
                  <p className="small-muted">
                    Estado:{" "}
                    <strong>
                      {req.status === "pending" && "Pendiente de respuesta"}
                      {req.status === "accepted" && "Aceptada"}
                      {req.status === "rescheduled" &&
                        `Reprogramada para el día ${req.scheduledDateKey}`}
                    </strong>
                  </p>
                </div>
              ))
            )}
          </div>
        )
      )}

      <div style={{ marginTop: 6 }}>
        <div className="field-label">Entrada</div>
        <div className="field-value">
          {record.entry || (
            <span className="small-muted">No registrada</span>
          )}
        </div>

        <div className="field-label">Salida</div>
        <div className="field-value">
          {record.exit || (
            <span className="small-muted">No registrada</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <div className="field-label">Nota / motivo (opcional)</div>
        <textarea
          className="note-input"
          value={record.note || ""}
          onChange={(e) => onUpdateNote(e.target.value)}
          placeholder="Ej.: cita médica, visita familiar, retraso por tráfico…"
        />
      </div>

      <div className="buttons-column">
        <button
          className="btn btn-primary btn-full"
          type="button"
          onClick={onMarkEntry}
        >
          Fichar entrada ({formatTimeNow()})
        </button>
        <button
          className="btn btn-full"
          type="button"
          onClick={onMarkExit}
        >
          Fichar salida ({formatTimeNow()})
        </button>

        <div className="panel">
          <strong>Ausencias y vacaciones</strong>
          <p className="field-note">
            Úsalo para días completos. Si solo fue media jornada, explícalo en
            la nota.
          </p>
          <div className="flex-row">
            <button
              className="btn btn-small"
              type="button"
              onClick={onMarkAbsent}
            >
              Marcar ausencia
            </button>
            <button
              className="btn btn-small"
              type="button"
              onClick={onRequestVacation}
            >
              Solicitar vacaciones
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Herramientas de Admin para exportar CSV
 */
function AdminExportView({ data }) {
  const [showDialog, setShowDialog] = useState(false);
  const [csvGenerated, setCsvGenerated] = useState("");

  function buildCsv() {
    const rows = [["Fecha", "Persona", "Entrada", "Salida", "Estado", "Nota"]];

    const userMap = Object.fromEntries(USERS.map((u) => [u.id, u.name]));

    const sortedDates = Object.keys(data).sort();
    for (const dateKey of sortedDates) {
      const dayData = data[dateKey];
      for (const userId of Object.keys(dayData)) {
        const r = dayData[userId];
        rows.push([
          dateKey,
          userMap[userId] || userId,
          r.entry || "",
          r.exit || "",
          r.status || "",
          (r.note || "").replace(/\n/g, " "),
        ]);
      }
    }

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    setCsvGenerated(csv);
    setShowDialog(true);
  }

  function downloadCsv() {
    const blob = new Blob([csvGenerated], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solaris-horarios.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="export-box">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Herramientas de Admin
        </div>
        <p className="small-muted">
          Aquí puedes descargar todo el historial en formato CSV (se abre en
          Excel / Google Sheets).
        </p>
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={buildCsv}
        >
          Descargar CSV
        </button>
      </div>

      {showDialog && (
        <div className="dialog-backdrop">
          <div className="dialog-paper">
            <div className="dialog-title">Exportar CSV</div>
            <div className="dialog-text">
              Toca “Descargar” para guardar el archivo. Si quieres verlo
              primero, puedes copiarlo desde el cuadro de abajo.
            </div>
            <textarea
              readOnly
              className="note-input"
              style={{ maxHeight: 150 }}
              value={csvGenerated}
            />
            <div
              className="flex-row"
              style={{ marginTop: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="btn btn-small btn-ghost"
                onClick={() => setShowDialog(false)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={downloadCsv}
              >
                Descargar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * App principal
 */
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [timeData, setTimeData] = useState(() => loadTimeData());
  const [trainingRequests, setTrainingRequests] = useState(() =>
    loadTrainingRequests()
  );
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Guardar en localStorage cuando cambie
  useEffect(() => {
    saveTimeData(timeData);
  }, [timeData]);

  useEffect(() => {
    saveTrainingRequests(trainingRequests);
  }, [trainingRequests]);

  function handleLogin(user) {
    setCurrentUser(user);
    setAdminMode(false);
    const today = new Date();
    setSelectedDate(today);
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function handleLogout() {
    setCurrentUser(null);
  }

  function updateRecord(date, userId, updater) {
    const key = toDateKey(date);
    setTimeData((prev) => {
      const prevDay = prev[key] || {};
      const prevRecord = prevDay[userId] || {};
      const nextRecord = updater(prevRecord);
      return {
        ...prev,
        [key]: {
          ...prevDay,
          [userId]: nextRecord,
        },
      };
    });
  }

  // Formación: crear solicitud (para usuarios normales)
  function handleCreateTrainingRequest() {
    if (!currentUser || !selectedDate) return;
    const dateKey = toDateKey(selectedDate);

    setTrainingRequests((prev) => {
      const already = prev.find(
        (r) => r.userId === currentUser.id && r.scheduledDateKey === dateKey
      );
      if (already) return prev; // ya tiene una para ese día
      const newReq = {
        id: Date.now(),
        userId: currentUser.id,
        requestedDateKey: dateKey,
        scheduledDateKey: dateKey,
        status: "pending",
      };
      return [...prev, newReq];
    });
  }

  // Formación: aceptar (Esteban)
  function handleAcceptTraining(id) {
    setTrainingRequests((prev) =>
      prev.map((req) =>
        req.id === id ? { ...req, status: "accepted" } : req
      )
    );
  }

  // Formación: reprogramar (Esteban)
  function handleRescheduleTraining(id) {
    const req = trainingRequests.find((r) => r.id === id);
    if (!req) return;
    const current = req.scheduledDateKey || req.requestedDateKey;
    const newDateStr = window.prompt(
      `Escribe la nueva fecha en formato AAAA-MM-DD`,
      current
    );
    if (!newDateStr) return;
    // Validación muy simple, lo guardamos tal cual
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

  return (
    <div className="app-card">
      <div className="app-header">
        <div className="logo-title">
          <div className="fake-logo">S</div>
          <div>
            <h1 style={{ fontSize: "1.3rem" }}>Solaris · Control horario</h1>
            <p className="subtitle">
              {isAdmin
                ? "Vista de administración (equipo completo)"
                : "Registro diario de jornada, ausencias y formación"}
            </p>
            <div className="pill">
              <span
                className="tag"
                style={{
                  background: isAdmin
                    ? "#fee2e2"
                    : currentUser.isTrainingManager
                    ? "#e0f2fe"
                    : "#dcfce7",
                  marginRight: 6,
                }}
              >
                {isAdmin
                  ? "Admin horario"
                  : currentUser.isTrainingManager
                  ? "Responsable formación"
                  : "Usuario"}
              </span>
              {currentUser.canAdminHours && !isAdmin && (
                <>Puede administrar el registro horario</>
              )}
              {isAdmin && <>Gestionando fichajes de todo el equipo</>}
              {!currentUser.canAdminHours &&
                currentUser.isTrainingManager &&
                !isAdmin && <>Gestiona solicitudes de formación</>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="current-user-tag">
            {currentUser.name}
            <br />
            <span className="small-muted">{currentUser.email}</span>
          </div>
          {currentUser.canAdminHours && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              style={{ marginTop: 4, width: "100%" }}
              onClick={() => setAdminMode((prev) => !prev)}
            >
              {adminMode
                ? "Volver a mi vista"
                : "Administrar registro horario"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={handleLogout}
            style={{ marginTop: 4, width: "100%" }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="layout">
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
            onMarkEntry={() =>
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                entry: formatTimeNow(),
                status: r.status || "present",
              }))
            }
            onMarkExit={() =>
              updateRecord(selectedDate, currentUser.id, (r) => ({
                ...r,
                exit: formatTimeNow(),
                status: r.status || "present",
              }))
            }
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
          />
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
